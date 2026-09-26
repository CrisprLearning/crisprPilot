/**
 * TV Content Controller
 * Angular 1.x controller for the images that play on the TV screens.
 *
 * Flow:
 *   1. The list is read from the public endpoint (public/tv-content.php), which
 *      returns every row with status = 1.
 *   2. To add content the admin picks an image, crops / resizes it in an
 *      on-page canvas cropper (default output 1920x1080), and enters a title
 *      and duration.
 *   3. The cropped frame is exported as a PNG stamped with 300 DPI, encoded as
 *      a base64 data URL and POSTed to restricted/tv-content/add-tv-content.php,
 *      which stores it in tv_content.imageData.
 */

var app = angular.module('tvContentApp', ['ngCookies']);

app.controller('tvContentController', ['$scope', '$http', '$cookies', '$timeout', '$q', function ($scope, $http, $cookies, $timeout, $q) {
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

    var LIST_URL = BASE_URL + '/public/tv-content.php';
    var ADD_URL = BASE_URL + '/restricted/tv-content/add-tv-content.php';

    // ===== Constants =====
    $scope.DEFAULT_WIDTH = 1920;
    $scope.DEFAULT_HEIGHT = 1080;
    $scope.OUTPUT_DPI = 300;
    var MIN_DIMENSION = 320;
    var MAX_DIMENSION = 3840;
    var MAX_SOURCE_BYTES = 25 * 1024 * 1024;
    var PREVIEW_W = 640;   // internal canvas width; CSS scales it to the modal
    var MAX_ZOOM = 4;
    var BACKGROUND = '#000000';

    // ===== State =====
    $scope.items = [];
    $scope.isLoading = true;
    $scope.loadError = '';
    $scope.addModalOpen = false;
    $scope.isSaving = false;
    $scope.previewItem = null;
    $scope.errors = {};
    $scope.form = newForm();
    $scope.crop = { loaded: false, loading: false, zoom: 1, minZoom: 1, upscaled: false };

    // Cropper internals (not on scope — never bound in the view).
    var cropImg = null;      // HTMLImageElement being cropped
    var cropUrl = null;      // object URL for the picked file
    var offsetX = 0;         // image centre relative to frame centre, in preview px
    var offsetY = 0;
    var drag = null;
    var canvasBound = false;

    function newForm() {
        return { title: '', duration: 10, width: 1920, height: 1080 };
    }

    $scope.getSkeletonRows = function () {
        return new Array(6);
    };

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
        if (err && err.status === 413) return 'The image is too large for the server. Try a smaller output size.';
        if (err && err.data && (err.data.message || err.data.error)) return err.data.message || err.data.error;
        return (err && err.message) || 'Something went wrong';
    }

    // ===== Init / list =====
    $scope.init = function () {
        $scope.loadContent();
    };

    $scope.loadContent = function () {
        $scope.isLoading = true;
        $scope.loadError = '';
        return $http({ method: 'GET', url: LIST_URL })
            .then(function (response) {
                $scope.items = unwrap(response).data || [];
            })
            .catch(function (err) {
                $scope.items = [];
                $scope.loadError = errorMessage(err);
            })
            .finally(function () {
                $scope.isLoading = false;
            });
    };

    $scope.formatDuration = function (value) {
        var seconds = Number(value);
        if (!isFinite(seconds) || seconds <= 0) return value == null ? '—' : String(value);
        if (seconds < 60) return seconds + ' sec';
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return s ? (m + ' min ' + s + ' sec') : (m + ' min');
    };

    $scope.openPreview = function (item) { $scope.previewItem = item; };
    $scope.closePreview = function () { $scope.previewItem = null; };

    // ===== Add-content modal =====
    $scope.openAddModal = function () {
        $scope.form = newForm();
        $scope.errors = {};
        resetCropper();
        $scope.addModalOpen = true;
        $timeout(function () {
            bindCanvas();
            resizeCanvas();
            draw();
        });
    };

    $scope.closeAddModal = function () {
        if ($scope.isSaving) return;
        $scope.addModalOpen = false;
        resetCropper();
    };

    $scope.chooseFile = function () {
        document.getElementById('tvImageFile').click();
    };

    function onFileChosen(e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        $scope.$apply(function () {
            if (file.type.indexOf('image/') !== 0) {
                $scope.errors.image = 'Please choose an image file.';
                return;
            }
            if (file.size > MAX_SOURCE_BYTES) {
                $scope.errors.image = 'Image is larger than 25 MB.';
                return;
            }
            $scope.errors.image = null;
            loadImage(file);
        });
    }

    // ===== Cropper =====
    function outSize() {
        function clampDim(v, fallback) {
            var n = Math.round(Number(v)) || fallback;
            return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n));
        }
        return { w: clampDim($scope.form.width, $scope.DEFAULT_WIDTH), h: clampDim($scope.form.height, $scope.DEFAULT_HEIGHT) };
    }

    function frame() {
        var o = outSize();
        return { w: PREVIEW_W, h: Math.max(1, Math.round(PREVIEW_W * o.h / o.w)) };
    }

    function geometry(z) {
        if (!cropImg) return null;
        var f = frame();
        var fill = Math.max(f.w / cropImg.naturalWidth, f.h / cropImg.naturalHeight);
        var contain = Math.min(f.w / cropImg.naturalWidth, f.h / cropImg.naturalHeight);
        var scale = fill * z;
        return {
            minZoom: Math.min(1, contain / fill),
            scale: scale,
            w: cropImg.naturalWidth * scale,
            h: cropImg.naturalHeight * scale
        };
    }

    // Keep the image covering the frame on any axis where it is larger than it,
    // and inside the frame on any axis where it is smaller (Fit mode).
    function clampOffset(z) {
        var g = geometry(z);
        if (!g) return;
        var f = frame();
        var limX = Math.abs(g.w - f.w) / 2;
        var limY = Math.abs(g.h - f.h) / 2;
        offsetX = Math.min(limX, Math.max(-limX, offsetX));
        offsetY = Math.min(limY, Math.max(-limY, offsetY));
    }

    function canvasEl() { return document.getElementById('cropCanvas'); }

    function resizeCanvas() {
        var c = canvasEl();
        if (!c) return;
        var f = frame();
        if (c.width !== f.w) c.width = f.w;
        if (c.height !== f.h) c.height = f.h;
    }

    function draw() {
        var c = canvasEl();
        if (!c) return;
        var ctx = c.getContext('2d');
        var f = frame();
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, f.w, f.h);
        if (!$scope.crop.loaded) return;
        var g = geometry($scope.crop.zoom);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cropImg, f.w / 2 + offsetX - g.w / 2, f.h / 2 + offsetY - g.h / 2, g.w, g.h);
        $scope.crop.upscaled = g.scale * (outSize().w / f.w) > 1;
    }

    function resetCropper() {
        if (cropUrl) URL.revokeObjectURL(cropUrl);
        cropUrl = null;
        cropImg = null;
        offsetX = offsetY = 0;
        $scope.crop = { loaded: false, loading: false, zoom: 1, minZoom: 1, upscaled: false };
        $timeout(function () {
            var c = canvasEl();
            if (c) c.classList.remove('ready');
            draw();
        });
    }

    function loadImage(file) {
        if (cropUrl) URL.revokeObjectURL(cropUrl);
        cropUrl = URL.createObjectURL(file);
        $scope.crop.loaded = false;
        $scope.crop.loading = true;
        var img = new Image();
        img.onload = function () {
            $scope.$apply(function () {
                cropImg = img;
                offsetX = offsetY = 0;
                $scope.crop.loading = false;
                $scope.crop.loaded = true;
                $scope.crop.zoom = 1;
                $scope.crop.minZoom = geometry(1).minZoom;
                canvasEl().classList.add('ready');
                draw();
            });
        };
        img.onerror = function () {
            $scope.$apply(function () {
                $scope.crop.loading = false;
                $scope.errors.image = 'Could not read that image.';
            });
        };
        img.src = cropUrl;
    }

    $scope.setZoom = function (z, recentre) {
        var g = geometry(1);
        if (!g) return;
        z = Math.min(MAX_ZOOM, Math.max(g.minZoom, z));
        $scope.crop.zoom = z;
        $scope.crop.minZoom = g.minZoom;
        if (recentre) offsetX = offsetY = 0;
        clampOffset(z);
        draw();
    };

    $scope.zoomBy = function (factor) { $scope.setZoom($scope.crop.zoom * factor); };
    $scope.onZoomSlider = function () { $scope.setZoom(Number($scope.crop.zoom)); };

    // Output aspect changed -> resize the frame and re-clamp so the image still covers it.
    $scope.onOutputSizeChanged = function () {
        resizeCanvas();
        if ($scope.crop.loaded) {
            $scope.crop.minZoom = geometry(1).minZoom;
            $scope.setZoom($scope.crop.zoom);
        } else {
            draw();
        }
    };

    function bindCanvas() {
        if (canvasBound) return;
        var c = canvasEl();
        if (!c) return;
        canvasBound = true;

        document.getElementById('tvImageFile').addEventListener('change', onFileChosen);

        c.addEventListener('pointerdown', function (e) {
            if (!$scope.crop.loaded) return;
            c.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
        });
        c.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var ratio = c.width / c.getBoundingClientRect().width;
            offsetX = drag.ox + (e.clientX - drag.x) * ratio;
            offsetY = drag.oy + (e.clientY - drag.y) * ratio;
            clampOffset($scope.crop.zoom);
            $scope.$applyAsync(draw);
        });
        function endDrag() { drag = null; }
        c.addEventListener('pointerup', endDrag);
        c.addEventListener('pointercancel', endDrag);

        // Non-passive so the wheel zooms the image instead of scrolling the modal.
        c.addEventListener('wheel', function (e) {
            if (!$scope.crop.loaded) return;
            e.preventDefault();
            $scope.$apply(function () {
                $scope.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
            });
        }, { passive: false });
    }

    // ===== Export: crop frame -> PNG (300 DPI) -> base64 data URL =====
    var crcTable = null;
    function crc32(bytes) {
        if (!crcTable) {
            crcTable = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                crcTable[n] = c >>> 0;
            }
        }
        var crc = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    // Canvas exports carry no physical-size metadata; stamp a `pHYs` chunk
    // (right after the 25-byte IHDR chunk) so viewers report the requested DPI.
    function setPngDpi(png, dpi) {
        var ppm = Math.round(dpi / 0.0254); // pixels per metre; 300 dpi -> 11811
        var chunk = new Uint8Array(21);     // 4 length + 4 type + 9 data + 4 crc
        var view = new DataView(chunk.buffer);
        view.setUint32(0, 9);
        chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
        view.setUint32(8, ppm);
        view.setUint32(12, ppm);
        chunk[16] = 1;                          // unit = metre
        view.setUint32(17, crc32(chunk.subarray(4, 17)));

        var at = 8 + 25;
        var out = new Uint8Array(png.length + chunk.length);
        out.set(png.subarray(0, at), 0);
        out.set(chunk, at);
        out.set(png.subarray(at), at + chunk.length);
        return out;
    }

    function exportPng() {
        return new Promise(function (resolve, reject) {
            var o = outSize();
            var f = frame();
            var g = geometry($scope.crop.zoom);
            var k = o.w / f.w;
            var out = document.createElement('canvas');
            out.width = o.w;
            out.height = o.h;
            var ctx = out.getContext('2d');
            ctx.fillStyle = BACKGROUND;
            ctx.fillRect(0, 0, o.w, o.h);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(cropImg, (f.w / 2 + offsetX - g.w / 2) * k, (f.h / 2 + offsetY - g.h / 2) * k, g.w * k, g.h * k);
            out.toBlob(function (blob) {
                if (!blob) { reject(new Error('Could not render the image')); return; }
                var reader = new FileReader();
                reader.onerror = function () { reject(new Error('Could not read the rendered image')); };
                reader.onload = function () {
                    var stamped = setPngDpi(new Uint8Array(reader.result), $scope.OUTPUT_DPI);
                    var dataReader = new FileReader();
                    dataReader.onerror = function () { reject(new Error('Could not encode the image')); };
                    dataReader.onload = function () { resolve(dataReader.result); };
                    dataReader.readAsDataURL(new Blob([stamped], { type: 'image/png' }));
                };
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });
    }

    // ===== Save =====
    function validate() {
        var e = {};
        if (!$scope.form.title || !String($scope.form.title).trim()) e.title = 'Title is required.';
        var d = Number($scope.form.duration);
        if (!isFinite(d) || Math.floor(d) !== d || d <= 0) e.duration = 'Enter a whole number of seconds.';
        ['width', 'height'].forEach(function (k) {
            var n = Number($scope.form[k]);
            if (!isFinite(n) || Math.floor(n) !== n || n < MIN_DIMENSION || n > MAX_DIMENSION) {
                e.size = 'Width and height must be whole numbers between ' + MIN_DIMENSION + ' and ' + MAX_DIMENSION + ' px.';
            }
        });
        if (!$scope.crop.loaded) e.image = 'Choose an image.';
        $scope.errors = e;
        return Object.keys(e).length === 0;
    }

    $scope.saveContent = function () {
        if (!validate()) return;
        $scope.isSaving = true;
        $q.when(exportPng())
            .then(function (imageData) {
                return $http({
                    method: 'POST',
                    url: ADD_URL,
                    headers: {
                        'X-Access-Token': getAdminTokenFromCookie(),
                        'Content-Type': 'application/json'
                    },
                    data: {
                        title: String($scope.form.title).trim(),
                        duration: String(Number($scope.form.duration)),
                        imageData: imageData
                    }
                });
            })
            .then(function (response) {
                unwrap(response);
                $scope.showToaster('success', 'Added', 'TV content added.');
                $scope.isSaving = false;
                $scope.closeAddModal();
                $scope.loadContent();
            })
            .catch(function (err) {
                $scope.showToaster('error', 'Could not add content', errorMessage(err));
            })
            .finally(function () {
                $scope.isSaving = false;
            });
    };
}]);
