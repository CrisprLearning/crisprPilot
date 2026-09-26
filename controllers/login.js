angular.module('AdminLoginApp', ['ngCookies'])


    .config(['$qProvider', function ($qProvider) {
        $qProvider.errorOnUnhandledRejections(false);
    }])

    .controller('adminloginController', function ($scope, $http, $cookies, $timeout) {
        // Initialize Toaster Service
        if (typeof initToaster === 'function') initToaster($scope, $timeout);


        $scope.username = "";
        $scope.password = "";

        $scope.isLoginError = false;
        $scope.warnMsg = "";
        $scope.isLoading = false;

        // Loading screen management
        $scope.showLoadingScreen = function (message, subtext) {
            var loadingScreen = document.getElementById('loadingScreen');
            var loadingText = document.getElementById('loadingText');
            var loadingSubtext = document.getElementById('loadingSubtext');

            if (loadingScreen) {
                loadingScreen.classList.remove('hidden', 'success');
                if (message) loadingText.innerHTML = message + '<span class="loading-dots"></span>';
                if (subtext) loadingSubtext.textContent = subtext;
            }
        };

        $scope.hideLoadingScreen = function () {
            var loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
            }
        };

        $scope.showSuccessScreen = function (message, subtext) {
            var loadingScreen = document.getElementById('loadingScreen');
            var loadingText = document.getElementById('loadingText');
            var loadingSubtext = document.getElementById('loadingSubtext');

            if (loadingScreen) {
                loadingScreen.classList.remove('hidden');
                loadingScreen.classList.add('success');
                loadingText.innerHTML = message;
                loadingSubtext.textContent = subtext;
            }
        };

        $scope.loginadmin = function () {
            $scope.isLoading = true;
            $scope.isLoginError = false;

            var data = {};
            data.username = $scope.username;
            data.password = $scope.password;

            // Use dynamic BASE_URL
            const BASE_URL = (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? "http://localhost:3000"
                : "https://crisprtech.app/crispr-apis";

            $http({
                method: 'POST',
                url: BASE_URL + '/restricted/login/authenticate.php',
                data: data,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })
                .then(function (response) {
                    $scope.token = response.data.response;
                    if (response.data.status == true) {

                        //Set cookies
                        var now = new Date();
                        now.setDate(now.getDate() + 7);
                        $cookies.put("vegaPilotAdminToken", $scope.token, {
                            expires: now
                        });

                        // Show success screen
                        $scope.showSuccessScreen('Login successful!', 'Redirecting to dashboard...');

                        // Redirect after showing success animation
                        $timeout(function () {
                            window.location = "class-notes.html";
                        }, 1500);

                    } else {
                        $scope.isLoading = false;
                        $scope.isLoginError = true;
                        $scope.warnMsg = response.data.error;
                    }
                })
                .catch(function (error) {
                    $scope.isLoading = false;
                    $scope.isLoginError = true;
                    $scope.warnMsg = "An error occurred. Please try again.";
                });
        }


        $scope.checkIfLoggedIn = function () {
            // Show loading screen while checking
            $scope.showLoadingScreen('Checking authentication', 'Please wait a moment');

            // Simulate a small delay to show the loading screen
            $timeout(function () {
                if ($cookies.get("vegaPilotAdminToken")) {
                    $scope.showSuccessScreen('Already logged in!', 'Redirecting to dashboard...');
                    $timeout(function () {
                        window.location = "class-notes.html";
                    }, 1000);
                } else {
                    // Hide loading screen to show login form
                    $scope.hideLoadingScreen();
                }
            }, 500);
        }

        $scope.checkIfLoggedIn();

    });
