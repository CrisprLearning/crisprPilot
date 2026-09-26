/**
 * Leave Requests Controller
 * Angular 1.x controller for hostel leave requests raised by parents from the
 * parent portal (hostel_leave_requests).
 *
 * Flow:
 *   1. restricted/hostel-leave/list-hostel-leave-requests.php returns every
 *      request with its student, parent and hostel. Pending ones come first.
 *   2. Filtering (status / hostel / search) happens client side.
 *   3. Pending requests can be approved or rejected via
 *      restricted/hostel-leave/decide-hostel-leave-request.php. A rejection
 *      needs a reason (shown to the parent). The row is updated in place from
 *      the response, without reloading the list.
 */

var app = angular.module('leaveRequestsApp', ['ngCookies']);

app.controller('leaveRequestsController', ['$scope', '$http', '$cookies', '$timeout', function ($scope, $http, $cookies, $timeout) {
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

    var LIST_URL = BASE_URL + '/restricted/hostel-leave/list-hostel-leave-requests.php';
    var DECIDE_URL = BASE_URL + '/restricted/hostel-leave/decide-hostel-leave-request.php';

    // ===== Constants =====
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var NOTE_MAX = 300;

    $scope.NOTE_MAX = NOTE_MAX;
    $scope.statusOptions = [
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'all', label: 'All' }
    ];

    // ===== State =====
    $scope.isLoading = true;
    $scope.loadError = '';
    $scope.today = '';
    $scope.requests = [];
    $scope.hostelOptions = [];
    $scope.visible = [];
    $scope.counts = {};
    $scope.filters = { search: '', hostel: '', status: 'pending' };

    $scope.detail = null;       // the request shown in the modal
    $scope.decision = {};       // { type: 'approved' | 'rejected', note }
    $scope.decisionError = '';
    $scope.isDeciding = false;

    // ===== Response helpers =====
    // Legacy scripts answer HTTP 200 with { status: 'success' | 'error' | 'failed' }
    // and put the reason in `message` or `error`.
    function unwrap(response) {
        var body = response && response.data;
        if (body && body.status === 'success') return body;
        var reason = body && (body.message || body.error);
        throw new Error(reason || 'Unexpected response from server');
    }

    function errorMessage(err) {
        if (err && err.data && (err.data.message || err.data.error)) return err.data.message || err.data.error;
        return (err && err.message) || 'Something went wrong';
    }

    // ===== Load =====
    $scope.init = function () {
        $scope.loadRequests();
    };

    $scope.loadRequests = function () {
        $scope.isLoading = true;
        $scope.loadError = '';
        return $http({
            method: 'GET',
            url: LIST_URL,
            headers: { 'X-Access-Token': getAdminTokenFromCookie() }
        })
            .then(function (response) {
                var data = unwrap(response).data || {};
                $scope.today = data.today || '';
                $scope.requests = data.requests || [];
                $scope.requests.forEach(deriveRequest);

                var names = {};
                $scope.requests.forEach(function (r) { names[r.hostelName] = true; });
                $scope.hostelOptions = [{ value: '', label: 'All hostels' }].concat(
                    Object.keys(names).sort().map(function (n) { return { value: n, label: n }; })
                );
                if (!names[$scope.filters.hostel]) $scope.filters.hostel = '';
                recompute();
            })
            .catch(function (err) {
                $scope.requests = [];
                $scope.loadError = errorMessage(err);
            })
            .finally(function () {
                $scope.isLoading = false;
            });
    };

    // ===== Derived data =====
    function deriveRequest(r) {
        r.hostelName = (r.hostel && r.hostel.name) || 'Hostel not on record';
        r.searchText = [
            r.student.name, r.student.id, r.parent.name, r.parent.mobile, r.hostelName, 'L-' + r.id
        ].join(' ').toLowerCase();
        // Pending leave whose out time has already passed needs attention first.
        r.outPassed = r.status === 'pending' && !!r.outAt && r.outAt.slice(0, 10) < $scope.today;
    }

    function recompute() {
        var f = $scope.filters;
        var q = (f.search || '').trim().toLowerCase();

        // Hostel + search scope the counts; the status filter only narrows the list.
        var scoped = $scope.requests.filter(function (r) {
            if (f.hostel && r.hostelName !== f.hostel) return false;
            return !q || r.searchText.indexOf(q) !== -1;
        });

        var counts = { all: scoped.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
        scoped.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
        $scope.counts = counts;

        $scope.visible = scoped.filter(function (r) {
            return f.status === 'all' || r.status === f.status;
        });
    }

    $scope.$watch('filters', function (n, o) {
        if (n !== o) recompute();
    }, true);

    $scope.setStatusFilter = function (status) {
        $scope.filters.status = status;
    };

    $scope.clearFilters = function () {
        $scope.filters = { search: '', hostel: '', status: 'all' };
    };

    // ===== Formatting =====
    // 'YYYY-MM-DDTHH:MM' -> '5 Oct 2026'
    $scope.formatDate = function (stamp) {
        if (!stamp) return '—';
        var p = String(stamp).slice(0, 10).split('-');
        if (p.length !== 3) return stamp;
        return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    };

    // 'YYYY-MM-DDTHH:MM' -> '4:30 pm'
    $scope.formatTime = function (stamp) {
        var m = /T(\d{2}):(\d{2})/.exec(stamp || '');
        if (!m) return '';
        var h = parseInt(m[1], 10);
        return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'am' : 'pm');
    };

    $scope.formatTimestamp = function (seconds) {
        if (!seconds) return '—';
        return new Date(seconds * 1000).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    };

    $scope.daysLabel = function (days) {
        return days + (days === 1 ? ' day' : ' days');
    };

    $scope.statusIcon = function (status) {
        if (status === 'approved') return 'ti-check';
        if (status === 'rejected') return 'ti-close';
        if (status === 'cancelled') return 'ti-na';
        return 'ti-time';
    };

    $scope.whereTo = function (r) {
        if (!r) return '';
        return r.goingTo === 'Other' && r.destination ? r.destination : r.goingTo;
    };

    // ===== Details / decide =====
    $scope.openDetail = function (r, type) {
        $scope.detail = r;
        $scope.decisionError = '';
        $scope.decision = type ? { type: type, note: '' } : {};
        if (type === 'rejected') focusNote();
    };

    $scope.closeDetail = function () {
        if ($scope.isDeciding) return;
        $scope.detail = null;
        $scope.decision = {};
        $scope.decisionError = '';
    };

    $scope.startDecision = function (type) {
        $scope.decision = { type: type, note: $scope.decision.note || '' };
        $scope.decisionError = '';
        if (type === 'rejected') focusNote();
    };

    $scope.cancelDecision = function () {
        $scope.decision = {};
        $scope.decisionError = '';
    };

    // The textarea is added by ng-if, so focus it after the digest.
    function focusNote() {
        $timeout(function () {
            var el = document.querySelector('.lr-note');
            if (el) el.focus();
        });
    }

    $scope.submitDecision = function () {
        var r = $scope.detail;
        var d = $scope.decision;
        var note = (d.note || '').trim();

        if (d.type === 'rejected' && !note) {
            $scope.decisionError = 'Reason for rejection is required. The parent will see it.';
            focusNote();
            return;
        }
        if (note.length > NOTE_MAX) {
            $scope.decisionError = 'Keep it within ' + NOTE_MAX + ' characters.';
            return;
        }
        $scope.decisionError = '';

        $scope.isDeciding = true;
        $http({
            method: 'POST',
            url: DECIDE_URL,
            headers: { 'X-Access-Token': getAdminTokenFromCookie(), 'Content-Type': 'application/json' },
            data: { id: r.id, decision: d.type, note: note }
        })
            .then(function (response) {
                var body = unwrap(response);
                var whatsapp = body.whatsapp || {};
                var hostelWhatsapp = body.hostelWhatsapp || [];
                angular.extend(r, body.data);
                deriveRequest(r);
                recompute();
                $scope.decision = {};

                var notified = [];
                if (whatsapp.sent) notified.push('parent');
                hostelWhatsapp.forEach(function (w) { if (w.sent) notified.push(w.role); });
                $scope.showToaster('success', r.status === 'approved' ? 'Leave approved' : 'Leave rejected',
                    r.student.name + ' · ' + $scope.formatDate(r.outAt) + ' to ' + $scope.formatDate(r.inAt) +
                    (notified.length ? ' · WhatsApp sent to ' + notified.join(', ') : ''));

                // The decision is saved either way; flag each failed WhatsApp so that person can be called.
                if (!whatsapp.sent) {
                    $scope.showToaster('warning', 'Parent not notified on WhatsApp',
                        (whatsapp.error || 'Message could not be sent') +
                        (r.parent.mobile ? '. Please inform the parent on ' + r.parent.mobile + '.' : '.'));
                }
                hostelWhatsapp.forEach(function (w) {
                    if (w.sent) return;
                    var who = w.role === 'warden' ? 'Warden' : 'Hostel provider';
                    $scope.showToaster('warning', who + ' not notified on WhatsApp',
                        (w.error || 'Message could not be sent') +
                        (w.to ? '. Please inform them on ' + w.to.slice(-10) + '.' : '.'));
                });
                $scope.detail = null;
            })
            .catch(function (err) {
                var msg = errorMessage(err);
                $scope.decisionError = msg;
                $scope.showToaster('error', 'Could not update leave request', msg);
            })
            .finally(function () {
                $scope.isDeciding = false;
            });
    };

    // Esc closes the details modal.
    function onKeydown(e) {
        if (e.key === 'Escape' && $scope.detail) {
            $scope.$apply($scope.closeDetail);
        }
    }
    document.addEventListener('keydown', onKeydown);
    $scope.$on('$destroy', function () {
        document.removeEventListener('keydown', onKeydown);
    });
}]);
