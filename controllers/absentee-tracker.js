/**
 * Absentee Tracker Controller
 * Angular 1.x controller listing the students absent on a day, with a
 * WhatsApp alert to their parents.
 *
 * Flow:
 *   1. restricted/attendance/all-summary.php (an HTML matrix, one row per
 *      student and one cell per day of the month) is parsed for the day.
 *   2. restricted/attendance/absent-alert-status.php gives each student's
 *      parent contact, the alerts already sent that day and the server clock.
 *   3. For today, from 2 pm IST, the checked absentees' parents are sent the
 *      `class_attendance_notification` template via
 *      restricted/attendance/alert-absent-parents.php, after a confirmation.
 *      The server re-checks the time and each absence and never alerts a
 *      parent twice for the same day.
 */

var app = angular.module('absenteeTrackerApp', ['ngCookies']);

app.controller('absenteeTrackerController', ['$scope', '$http', '$cookies', '$timeout', '$interval', function ($scope, $http, $cookies, $timeout, $interval) {
    // Initialize Toaster Service
    if (typeof initToaster === 'function') initToaster($scope, $timeout);

    // ===== Auth =====
    if (getAdminTokenFromCookie()) {
        $scope.isLoggedIn = true;
    } else {
        $scope.isLoggedIn = false;
        window.location = "index.html";
    }

    $scope.logoutNow = function () {
        if ($cookies.get("vegaPilotAdminToken")) {
            $cookies.remove("vegaPilotAdminToken");
        }
        window.location = "index.html";
    };

    function getAdminTokenFromCookie() {
        return $cookies.get("vegaPilotAdminToken") || localStorage.getItem("vegaPilotAdminToken");
    }

    // ===== API Configuration =====
    const BASE_URL = (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? "http://localhost:3000"
        : "https://crisprtech.app/crispr-apis";

    // The summary is an HTML page guarded by a fixed ?key=, served only from production.
    var SUMMARY_URL = 'https://crisprtech.app/crispr-apis/restricted/attendance/all-summary.php';
    var SUMMARY_KEY = 'crispr2027';
    var STATUS_URL = BASE_URL + '/restricted/attendance/absent-alert-status.php';
    var ALERT_URL = BASE_URL + '/restricted/attendance/alert-absent-parents.php';

    // ===== Constants =====
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var WA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    var ALERT_FROM_HOUR = 14;   // matches ABSENT_ALERT_FROM_HOUR on the server

    // ===== State =====
    $scope.isLoading = true;
    $scope.loadError = '';
    $scope.statusError = '';      // parent contacts / alert log could not be loaded
    $scope.today = istToday();
    $scope.filters = { date: toDateObject($scope.today), search: '' };
    $scope.dateKey = $scope.today;
    $scope.summary = { total: 0, present: 0, absent: 0, alerted: 0 };
    $scope.absentees = [];
    $scope.visible = [];
    $scope.selection = { count: 0 };

    $scope.alertsOpen = false;
    $scope.alertsOpenLabel = '2 pm';
    $scope.confirm = null;        // { students, preview } while the warning is open
    $scope.isSending = false;
    $scope.outcome = null;        // { counts, problems } after a send

    var clockSkew = 0;            // server clock minus device clock, ms
    var alertsOpenAt = null;      // ms, today's 2 pm IST

    // ===== Response helpers =====
    function unwrap(response) {
        var body = response && response.data;
        if (body && body.status === 'success') return body;
        var reason = body && (body.message || body.error);
        throw new Error(reason || 'Unexpected response from server');
    }

    function errorMessage(err) {
        if (err && err.data && (err.data.message || err.data.error)) return err.data.message || err.data.error;
        if (err && err.status === -1) return 'Could not reach the server. Check your connection.';
        if (err instanceof SyntaxError) return 'The server returned an invalid response';
        return (err && err.message) || 'Something went wrong';
    }

    // ===== Dates =====
    // 'YYYY-MM-DD' for today in IST, whatever the device's timezone.
    function istToday() {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }

    function toDateObject(ymd) {
        var p = ymd.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function toKey(date) {
        return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
    }

    // 'YYYY-MM-DD' -> '24 Sep 2026'
    $scope.formatDate = function (ymd) {
        var p = (ymd || '').split('-');
        return p.length === 3 ? parseInt(p[2], 10) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0] : ymd;
    };

    $scope.formatTime = function (seconds) {
        return new Date(seconds * 1000).toLocaleTimeString('en-IN', {
            hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata'
        });
    };

    // ===== Load =====
    $scope.init = function () {
        $scope.load();
        var tick = $interval(updateClock, 30000);
        $scope.$on('$destroy', function () { $interval.cancel(tick); });
    };

    $scope.onDateChange = function () {
        var d = $scope.filters.date;
        if (!(d instanceof Date) || isNaN(d)) return;
        if (toKey(d) > $scope.today) {
            $scope.filters.date = toDateObject($scope.today);
            $scope.showToaster('info', 'Future date', 'Attendance is only available up to today.');
        }
        $scope.load();
    };

    $scope.load = function () {
        var key = toKey($scope.filters.date);
        var p = key.split('-');

        $scope.isLoading = true;
        $scope.loadError = '';
        $scope.statusError = '';
        $scope.outcome = null;

        var summary = $http({
            method: 'GET',
            url: SUMMARY_URL,
            params: { key: SUMMARY_KEY, month: +p[1], year: +p[0], name: 'true' },
            responseType: 'text',
            transformResponse: []
        });

        // Parent contacts and sent alerts are needed to alert, not to list; keep
        // showing absentees if only this call fails.
        var status = $http({
            method: 'GET',
            url: STATUS_URL,
            params: { date: key },
            headers: { 'X-Access-Token': getAdminTokenFromCookie() }
        })
            .then(function (response) { return unwrap(response).data || {}; })
            .catch(function (err) {
                $scope.statusError = errorMessage(err);
                return null;
            });

        return summary
            .then(function (response) {
                var students = parseSummary(response.data, +p[2]);
                return status.then(function (info) { build(key, +p[2], students, info); });
            })
            .catch(function (err) {
                $scope.absentees = [];
                $scope.visible = [];
                $scope.loadError = errorMessage(err);
            })
            .finally(function () {
                $scope.isLoading = false;
            });
    };

    /**
     * all-summary.php rows: td.id-cell, td.name-cell, then one cell per day of the
     * month whose span.mark is .present / .absent / .future. Returns
     * [{ id, name, marks: ['present', 'absent', ...] }] with marks indexed day - 1.
     */
    function parseSummary(html, day) {
        var doc = new DOMParser().parseFromString(html || '', 'text/html');
        var rows = doc.querySelectorAll('tbody tr');
        if (!doc.querySelector('thead') || (!rows.length && !doc.querySelector('.table-wrap'))) {
            var reason = doc.body && doc.body.textContent.trim();
            throw new Error(reason ? reason.slice(0, 200) : 'Attendance summary could not be read');
        }

        var students = [];
        Array.prototype.forEach.call(rows, function (tr) {
            var idCell = tr.querySelector('td.id-cell');
            if (!idCell) return;   // "no students" row
            var nameCell = tr.querySelector('td.name-cell');
            var marks = Array.prototype.map.call(tr.querySelectorAll('span.mark'), function (span) {
                if (span.classList.contains('present')) return 'present';
                if (span.classList.contains('absent')) return 'absent';
                return 'future';
            });
            students.push({
                id: parseInt(idCell.textContent, 10),
                name: nameCell ? nameCell.textContent.trim() : 'Student #' + idCell.textContent.trim(),
                marks: marks
            });
        });
        if (students.length && students[0].marks.length < day) {
            throw new Error('Attendance summary has no column for day ' + day);
        }
        return students;
    }

    function build(key, day, students, info) {
        var parents = (info && info.parents) || {};
        var alerts = (info && info.alerts) || {};
        var absentees = [];
        var present = 0;

        students.forEach(function (s) {
            var mark = s.marks[day - 1];
            if (mark === 'present') present++;
            if (mark !== 'absent') return;

            // Consecutive absent days ending on this day.
            var streak = 0;
            for (var d = day - 1; d >= 0 && s.marks[d] === 'absent'; d--) streak++;

            var parent = parents[s.id] || null;
            var alert = alerts[s.id] || null;
            absentees.push({
                id: s.id,
                name: s.name,
                streak: streak,
                parent: parent,
                alert: alert,
                selectable: !!info && !alert && !!(parent && parent.mobile),
                selected: false,
                searchText: [s.name, s.id, parent && parent.name, parent && parent.mobile].join(' ').toLowerCase()
            });
        });

        $scope.dateKey = key;
        $scope.isToday = key === $scope.today;
        // all-summary.php runs on the server's clock (UTC), so early in the IST
        // day today's column is still "upcoming".
        $scope.notYet = students.some(function (s) { return s.marks[day - 1] === 'future'; });
        // Nobody present at all: a holiday, or attendance hasn't synced yet.
        $scope.noAttendance = !$scope.notYet && students.length > 0 && present === 0;
        if ($scope.noAttendance) {
            absentees.forEach(function (a) { a.selectable = false; });
        }
        $scope.absentees = absentees;
        $scope.summary = {
            total: students.length,
            present: present,
            absent: absentees.length,
            alerted: absentees.filter(function (a) { return a.alert; }).length
        };

        if (info) {
            clockSkew = info.serverTime * 1000 - Date.now();
            alertsOpenAt = info.alertsOpenAt * 1000;
            $scope.alertsOpenLabel = $scope.formatTime(info.alertsOpenAt).replace(':00', '');
            if (info.today) $scope.today = info.today;
            $scope.isToday = key === $scope.today;
        }
        updateClock();
        recompute();
    }

    function updateClock() {
        if (alertsOpenAt === null) {
            // No server clock yet; the server enforces the cutoff anyway.
            var hour = +new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
            $scope.alertsOpen = hour >= ALERT_FROM_HOUR;
        } else {
            $scope.alertsOpen = Date.now() + clockSkew >= alertsOpenAt;
        }
        // Past midnight the page is showing yesterday; the list must be reloaded.
        if ($scope.isToday && istToday() > $scope.today) $scope.alertsOpen = false;
    }

    // ===== Filter / selection =====
    function recompute() {
        var q = ($scope.filters.search || '').trim().toLowerCase();
        $scope.visible = $scope.absentees.filter(function (a) {
            return !q || a.searchText.indexOf(q) !== -1;
        });
        recount();
    }

    function recount() {
        $scope.selection.count = $scope.absentees.filter(function (a) { return a.selected; }).length;
        var selectable = $scope.visible.filter(function (a) { return a.selectable; });
        $scope.selection.allVisible = selectable.length > 0 && selectable.every(function (a) { return a.selected; });
        $scope.selection.anySelectable = selectable.length > 0;
    }

    $scope.$watch('filters.search', function (n, o) {
        if (n !== o) recompute();
    });

    $scope.toggle = function (a) {
        if (!a.selectable) return;
        a.selected = !a.selected;
        recount();
    };

    $scope.toggleAll = function () {
        var select = !$scope.selection.allVisible;
        $scope.visible.forEach(function (a) { if (a.selectable) a.selected = select; });
        recount();
    };

    $scope.clearSelection = function () {
        $scope.absentees.forEach(function (a) { a.selected = false; });
        recount();
    };

    $scope.canAlert = function () {
        return $scope.isToday && !$scope.notYet && !$scope.noAttendance && !$scope.statusError;
    };

    $scope.rowNote = function (a) {
        if (a.alert) return null;
        if ($scope.statusError) return 'Parent contact unavailable';
        if (!a.parent) return 'No parent linked';
        if (!a.parent.mobile) return 'Parent has no mobile';
        return null;
    };

    // ===== Alert =====
    function waDate(ymd) {
        var p = ymd.split('-');
        return parseInt(p[2], 10) + ' ' + WA_MONTHS[+p[1] - 1] + ', ' + p[0];
    }

    $scope.openConfirm = function () {
        updateClock();
        if (!$scope.alertsOpen || !$scope.selection.count) return;
        var students = $scope.absentees.filter(function (a) { return a.selected; });
        var first = students[0];
        $scope.confirm = {
            students: students,
            student: first.name + ' (ID: ' + first.id + ')',
            date: waDate($scope.dateKey)
        };
    };

    $scope.closeConfirm = function () {
        if ($scope.isSending) return;
        $scope.confirm = null;
    };

    $scope.sendAlerts = function () {
        var students = $scope.confirm.students;
        var byId = {};
        students.forEach(function (a) { byId[a.id] = a; });

        $scope.isSending = true;
        $http({
            method: 'POST',
            url: ALERT_URL,
            headers: { 'X-Access-Token': getAdminTokenFromCookie(), 'Content-Type': 'application/json' },
            data: { candidateIds: students.map(function (a) { return a.id; }) }
        })
            .then(function (response) {
                var data = unwrap(response).data || {};
                var now = Math.floor((Date.now() + clockSkew) / 1000);
                var problems = [];

                (data.results || []).forEach(function (r) {
                    var a = byId[r.candidateId];
                    if (!a) return;
                    a.selected = false;
                    if (r.status === 'sent') {
                        a.alert = { sentTo: r.to, sentOn: now, sentBy: 'you' };
                        a.selectable = false;
                    } else {
                        if (r.error === 'Parent already alerted today') {
                            a.alert = a.alert || { sentTo: r.to, sentOn: null };
                            a.selectable = false;
                        }
                        problems.push({ name: a.name, id: a.id, status: r.status, error: r.error });
                    }
                });

                var counts = data.counts || {};
                $scope.summary.alerted = $scope.absentees.filter(function (a) { return a.alert; }).length;
                recount();
                $scope.confirm = null;

                if (counts.sent) {
                    $scope.showToaster('success', 'Parents alerted',
                        counts.sent + (counts.sent === 1 ? ' parent was' : ' parents were') + ' sent the absence alert on WhatsApp.');
                }
                if (problems.length) {
                    $scope.outcome = { counts: counts, problems: problems };
                }
            })
            .catch(function (err) {
                $scope.showToaster('error', 'Alerts not sent', errorMessage(err));
            })
            .finally(function () {
                $scope.isSending = false;
            });
    };

    $scope.closeOutcome = function () {
        $scope.outcome = null;
    };

    // Esc closes the open modal.
    function onKeydown(e) {
        if (e.key !== 'Escape') return;
        if ($scope.confirm) $scope.$apply($scope.closeConfirm);
        else if ($scope.outcome) $scope.$apply($scope.closeOutcome);
    }
    document.addEventListener('keydown', onKeydown);
    $scope.$on('$destroy', function () {
        document.removeEventListener('keydown', onKeydown);
    });
}]);
