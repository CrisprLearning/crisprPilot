/**
 * Hostel Fee Controller
 * Angular 1.x controller for the consolidated hostel fee ledger ("Hostel Fee -
 * Collection" sheet): one row per student, a Deposit column and one column per
 * fee month.
 *
 * Flow:
 *   1. restricted/hostel-fee/list-hostel-fee.php returns every active invoice
 *      (payments_hostel_fee row) grouped per student. Pending invoices past
 *      their due date come back as `overdue`.
 *   2. Each cell sums the invoices in it and takes the worst status
 *      (overdue > pending > paid) for its colour.
 *   3. Clicking a cell shows its invoices. Pending / overdue ones can be marked
 *      paid via restricted/hostel-fee/record-hostel-fee-payment.php; the row is
 *      updated in place from the response, without reloading the ledger.
 */

var app = angular.module('hostelFeeApp', ['ngCookies']);

app.controller('hostelFeeController', ['$scope', '$http', '$cookies', '$timeout', function ($scope, $http, $cookies, $timeout) {
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

    var LIST_URL = BASE_URL + '/restricted/hostel-fee/list-hostel-fee.php';
    var PAY_URL = BASE_URL + '/restricted/hostel-fee/record-hostel-fee-payment.php';

    // ===== Constants =====
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var STATUS_RANK = { paid: 0, pending: 1, overdue: 2 };

    $scope.paymentModes = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];
    $scope.statusOptions = [
        { value: 'all', label: 'All' },
        { value: 'overdue', label: 'Overdue' },
        { value: 'pending', label: 'Pending' },
        { value: 'paid', label: 'Fully paid' }
    ];

    // ===== State =====
    $scope.isLoading = true;
    $scope.loadError = '';
    $scope.today = '';
    $scope.students = [];       // raw students from the API, augmented with derived fields
    $scope.months = [];
    $scope.cellKeys = [];       // 'deposit' followed by each YYYY-MM
    $scope.residenceOptions = [];
    $scope.groups = [];
    $scope.totals = { cells: {}, balance: 0 };
    $scope.summary = {};
    $scope.visibleCount = 0;
    $scope.filters = { search: '', residenceId: 0, status: 'all' };
    $scope.sort = { key: 'name', dir: 1 };

    $scope.detail = null;       // { student, key, cell, title }
    $scope.payForm = {};
    $scope.payErrors = {};
    $scope.isPaying = false;

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

    // ===== Init / load =====
    // ===== Passcode soft lock =====
    // A deterrent only: the passcode ships in this file. Real protection is the
    // admin token checked by the APIs. Unlocking lasts for the browser tab.
    var PASSCODE = '2024';
    var UNLOCK_KEY = 'hostelFeeUnlocked';

    $scope.lock = { code: '', error: '' };
    $scope.locked = true;
    try {
        $scope.locked = sessionStorage.getItem(UNLOCK_KEY) !== '1';
    } catch (e) { /* storage blocked: stay locked */ }

    $scope.onPasscodeChange = function () {
        $scope.lock.error = '';
        // Unlock as soon as the 4th digit is typed.
        if (($scope.lock.code || '').length === PASSCODE.length) $scope.unlock();
    };

    $scope.unlock = function () {
        if ($scope.lock.code !== PASSCODE) {
            $scope.lock = { code: '', error: 'Incorrect passcode' };
            return;
        }
        try {
            sessionStorage.setItem(UNLOCK_KEY, '1');
        } catch (e) { /* ignore */ }
        $scope.locked = false;
        $scope.loadLedger();
    };

    $scope.init = function () {
        if (!$scope.locked) {
            $scope.loadLedger();
            return;
        }
        // `autofocus` doesn't fire for elements inserted by ng-if.
        $timeout(function () {
            var input = document.querySelector('.hf-lock-input');
            if (input) input.focus();
        });
    };

    $scope.loadLedger = function () {
        $scope.isLoading = true;
        $scope.loadError = '';
        return $http({
            method: 'GET',
            url: LIST_URL,
            headers: { 'X-Access-Token': getAdminTokenFromCookie() }
        })
            .then(function (response) {
                var data = unwrap(response).data || {};
                $scope.today = data.today || isoToday();
                $scope.months = data.months || [];
                $scope.cellKeys = ['deposit'].concat($scope.months);
                $scope.students = data.students || [];
                $scope.residenceOptions = [{ id: 0, name: 'All hostels' }].concat(data.residences || []);
                if (!$scope.residenceOptions.some(function (r) { return r.id === $scope.filters.residenceId; })) {
                    $scope.filters.residenceId = 0;
                }
                $scope.students.forEach(deriveStudent);
                recompute();
            })
            .catch(function (err) {
                $scope.students = [];
                $scope.loadError = errorMessage(err);
            })
            .finally(function () {
                $scope.isLoading = false;
            });
    };

    function isoToday() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function pad(n) {
        return (n < 10 ? '0' : '') + n;
    }

    // ===== Derived data =====

    // Part payments leave an invoice pending with amountPaid < amount.
    function paidOf(e) {
        return e.status === 'paid' ? e.amount : (e.amountPaid || 0);
    }

    $scope.balanceOf = function (e) {
        return e.amount - paidOf(e);
    };

    // Sum a cell's invoices; its colour is the worst status among them.
    function buildCell(entries) {
        if (!entries || entries.length === 0) return null;
        var cell = { entries: entries, amount: 0, paid: 0, status: 'paid' };
        entries.forEach(function (e) {
            cell.amount += e.amount;
            cell.paid += paidOf(e);
            if (STATUS_RANK[e.status] > STATUS_RANK[cell.status]) cell.status = e.status;
        });
        return cell;
    }

    function deriveStudent(s) {
        var months = s.months || {};
        s.cells = { deposit: buildCell(s.deposit) };
        $scope.months.forEach(function (m) {
            s.cells[m] = buildCell(months[m]);
        });

        s.invoiced = 0;
        s.balance = 0;
        s.overdue = 0;
        s.pending = 0;
        s.worst = 'paid';
        $scope.cellKeys.forEach(function (key) {
            var cell = s.cells[key];
            if (!cell) return;
            cell.entries.forEach(function (e) {
                s.invoiced += e.amount;
                if (e.status === 'overdue') s.overdue += $scope.balanceOf(e);
                if (e.status === 'pending') s.pending += $scope.balanceOf(e);
            });
            s.balance += cell.amount - cell.paid;
            if (STATUS_RANK[cell.status] > STATUS_RANK[s.worst]) s.worst = cell.status;
        });
        s.searchText = (s.name + ' ' + s.candidateId).toLowerCase();
    }

    function matchesStatus(s, status) {
        if (status === 'overdue') return s.overdue > 0;
        if (status === 'pending') return s.pending > 0;
        if (status === 'paid') return s.balance === 0;
        return true;
    }

    function compareStudents(a, b) {
        var key = $scope.sort.key;
        var av = a[key], bv = b[key];
        if (key === 'name') {
            av = (av || '').toLowerCase();
            bv = (bv || '').toLowerCase();
        }
        if (av == null && bv != null) return 1;
        if (bv == null && av != null) return -1;
        if (av < bv) return -$scope.sort.dir;
        if (av > bv) return $scope.sort.dir;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    }

    function recompute() {
        var f = $scope.filters;
        var q = (f.search || '').trim().toLowerCase();

        // Residence + search scope the summary cards; the status filter only
        // narrows the table (the cards themselves are the status filter).
        var scoped = $scope.students.filter(function (s) {
            if (f.residenceId && s.residenceId !== f.residenceId) return false;
            return !q || s.searchText.indexOf(q) !== -1;
        });

        var summary = {
            studentCount: scoped.length, invoiceCount: 0, invoiced: 0, paid: 0, pending: 0, overdue: 0,
            pendingCount: 0, overdueCount: 0, overdueStudents: 0, paidStudents: 0
        };
        scoped.forEach(function (s) {
            summary.invoiced += s.invoiced;
            summary.pending += s.pending;
            summary.overdue += s.overdue;
            if (s.overdue > 0) summary.overdueStudents++;
            if (s.balance === 0) summary.paidStudents++;
            $scope.cellKeys.forEach(function (key) {
                var cell = s.cells[key];
                if (!cell) return;
                cell.entries.forEach(function (e) {
                    summary.invoiceCount++;
                    if (e.status === 'pending') summary.pendingCount++;
                    if (e.status === 'overdue') summary.overdueCount++;
                });
            });
        });
        summary.paid = summary.invoiced - summary.pending - summary.overdue;
        $scope.summary = summary;

        var visible = scoped.filter(function (s) { return matchesStatus(s, f.status); });
        visible.sort(compareStudents);
        $scope.visibleCount = visible.length;

        var totals = { cells: {}, balance: 0 };
        $scope.cellKeys.forEach(function (key) { totals.cells[key] = { invoiced: 0, paid: 0 }; });

        var byResidence = {};
        visible.forEach(function (s) {
            var g = byResidence[s.residenceId];
            if (!g) {
                g = byResidence[s.residenceId] = { id: s.residenceId, name: s.residenceName, students: [], overdue: 0 };
            }
            g.students.push(s);
            g.overdue += s.overdue;

            totals.balance += s.balance;
            $scope.cellKeys.forEach(function (key) {
                var cell = s.cells[key];
                if (!cell) return;
                totals.cells[key].invoiced += cell.amount;
                totals.cells[key].paid += cell.paid;
            });
        });
        $scope.totals = totals;

        // Keep the API's residence order.
        $scope.groups = $scope.residenceOptions
            .map(function (r) { return byResidence[r.id]; })
            .filter(Boolean);
    }

    $scope.$watch('filters', function (n, o) {
        if (n !== o) recompute();
    }, true);

    // ===== Filters / sorting =====
    $scope.setStatusFilter = function (status) {
        $scope.filters.status = status;
    };

    $scope.clearFilters = function () {
        $scope.filters = { search: '', residenceId: 0, status: 'all' };
    };

    $scope.setSort = function (key) {
        if ($scope.sort.key === key) {
            $scope.sort.dir = -$scope.sort.dir;
        } else {
            // Largest balance first is the useful default for money.
            $scope.sort = { key: key, dir: key === 'balance' ? -1 : 1 };
        }
        recompute();
    };

    $scope.sortIcon = function (key) {
        if ($scope.sort.key !== key) return 'ti-exchange-vertical';
        return $scope.sort.dir === 1 ? 'ti-arrow-up' : 'ti-arrow-down';
    };

    // ===== Formatting =====
    $scope.money = function (n) {
        if (n == null || isNaN(n)) return '—';
        return '₹' + Number(n).toLocaleString('en-IN');
    };

    $scope.percent = function (part, whole) {
        if (!whole) return 0;
        return Math.round((part / whole) * 100);
    };

    $scope.formatDate = function (iso) {
        if (!iso) return '—';
        var p = String(iso).split('-');
        if (p.length !== 3) return iso;
        return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    };

    $scope.formatTimestamp = function (seconds) {
        if (!seconds) return '';
        return new Date(seconds * 1000).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    };

    function monthName(ym) {
        var p = String(ym).split('-');
        return MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    }

    $scope.columnLabel = function (key) {
        return key === 'deposit' ? 'Deposit' : MONTHS[parseInt(key.split('-')[1], 10) - 1];
    };

    $scope.columnSub = function (key) {
        return key === 'deposit' ? 'Refundable' : key.split('-')[0];
    };

    $scope.typeLabel = function (e) {
        if (e.type === 'DEPOSIT') return 'Security deposit (refundable)';
        return (e.type === 'RENT' ? 'Rent' : 'Other') + ' · ' + monthName(e.month);
    };

    $scope.statusIcon = function (status) {
        if (status === 'paid') return 'ti-check';
        if (status === 'overdue') return 'ti-alert';
        return 'ti-time';
    };

    $scope.daysLate = function (e) {
        var due = Date.parse(e.dueOn + 'T00:00:00');
        var today = Date.parse($scope.today + 'T00:00:00');
        return Math.max(0, Math.round((today - due) / 86400000));
    };

    // ===== Cell details =====
    $scope.openCell = function (student, key) {
        var cell = student.cells[key];
        if (!cell) return;
        $scope.detail = {
            student: student,
            key: key,
            cell: cell,
            title: key === 'deposit' ? 'Deposit' : monthName(key)
        };
        $scope.cancelPayment();

        // A single unpaid invoice is almost always why the cell was clicked:
        // open its payment form straight away.
        var unpaid = cell.entries.filter(function (e) { return e.status !== 'paid'; });
        if (unpaid.length === 1) $scope.startPayment(unpaid[0]);
    };

    $scope.closeDetail = function () {
        if ($scope.isPaying) return;
        $scope.detail = null;
        $scope.cancelPayment();
    };

    // ===== Record payment =====
    $scope.startPayment = function (entry) {
        $scope.payForm = {
            entryId: entry.id, amount: $scope.balanceOf(entry), paidOn: fromIsoDate($scope.today),
            mode: '', receiptNo: '', note: ''
        };
        $scope.payErrors = {};
    };

    $scope.cancelPayment = function () {
        $scope.payForm = {};
        $scope.payErrors = {};
    };

    // <input type="date"> binds a local-time Date object.
    function fromIsoDate(iso) {
        var p = String(iso).split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function toIsoDate(value) {
        if (!(value instanceof Date) || isNaN(value.getTime())) return '';
        return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
    }

    $scope.isPartPayment = function (entry) {
        var amt = $scope.payForm.amount;
        return typeof amt === 'number' && amt > 0 && amt < $scope.balanceOf(entry);
    };

    $scope.submitPayment = function (entry) {
        var form = $scope.payForm;
        var paidOn = toIsoDate(form.paidOn);
        var balance = $scope.balanceOf(entry);
        var errors = {};

        if (typeof form.amount !== 'number' || !isFinite(form.amount) || form.amount <= 0 || form.amount % 1 !== 0) {
            errors.amount = 'Enter a whole amount of at least ₹1.';
        } else if (form.amount > balance) {
            errors.amount = 'Cannot be more than the balance due (' + $scope.money(balance) + ').';
        } else if (entry.amountPaid > 0 && form.amount !== balance) {
            // At most two payments per invoice: the second must clear it.
            errors.amount = 'A part payment was already made. Pay the full balance (' + $scope.money(balance) + ').';
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
            errors.paidOn = 'Enter the date the payment was received.';
        } else if (paidOn > $scope.today) {
            errors.paidOn = 'Payment date cannot be in the future.';
        }
        if (!form.mode) {
            errors.mode = 'Choose how it was paid.';
        }
        $scope.payErrors = errors;
        if (Object.keys(errors).length) return;

        $scope.isPaying = true;
        $http({
            method: 'POST',
            url: PAY_URL,
            headers: { 'X-Access-Token': getAdminTokenFromCookie(), 'Content-Type': 'application/json' },
            data: {
                id: entry.id,
                amount: form.amount,
                paidOn: paidOn,
                mode: form.mode,
                receiptNo: (form.receiptNo || '').trim(),
                note: (form.note || '').trim()
            }
        })
            .then(function (response) {
                var paidNow = form.amount;
                angular.extend(entry, unwrap(response).data);

                var detail = $scope.detail;
                deriveStudent(detail.student);
                recompute();
                detail.cell = detail.student.cells[detail.key];
                $scope.cancelPayment();

                if (entry.status !== 'paid') {
                    // Part payment: keep the modal open showing paid-so-far / balance.
                    $scope.showToaster('success', 'Part payment recorded',
                        $scope.money(paidNow) + ' · ' + detail.title + ' · ' + detail.student.name +
                        ' · ' + $scope.money($scope.balanceOf(entry)) + ' still due');
                    return;
                }

                $scope.showToaster('success', 'Payment recorded',
                    $scope.money(paidNow) + ' · ' + detail.title + ' · ' + detail.student.name);

                var stillUnpaid = detail.cell.entries.filter(function (e) { return e.status !== 'paid'; });
                if (stillUnpaid.length === 0) {
                    $scope.detail = null;
                } else if (stillUnpaid.length === 1) {
                    $scope.startPayment(stillUnpaid[0]);
                }
            })
            .catch(function (err) {
                $scope.showToaster('error', 'Could not record payment', errorMessage(err));
            })
            .finally(function () {
                $scope.isPaying = false;
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
