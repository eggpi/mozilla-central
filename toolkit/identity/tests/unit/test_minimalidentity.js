"use strict";

XPCOMUtils.defineLazyModuleGetter(this, "MinimalIDService",
                                  "resource://gre/modules/identity/MinimalIdentity.jsm",
                                  "IdentityService");

Cu.import("resource://gre/modules/identity/LogUtils.jsm");

function log(...aMessageArgs) {
  Logger.log.apply(Logger, ["test_minimalidentity"].concat(aMessageArgs));
}

function test_overall() {
  do_check_neq(MinimalIDService, null);
  run_next_test();
}

function test_mock_doc() {
  do_test_pending();
  let mockedDoc = mock_doc(null, TEST_URL, function(action, params) {
    do_check_eq(action, 'coffee');
    do_test_finished();
    run_next_test();
  });

  mockedDoc.doCoffee();
}

/*
 * Test that the "identity-controller-watch" signal is emitted correctly
 */
function test_watch() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-watch", function (aSubject, aTopic, aData) {
    do_check_eq(aSubject.wrappedJSObject.id, mockedDoc.id);
    do_check_eq(aSubject.wrappedJSObject.origin, TEST_URL);
    do_test_finished();
    run_next_test();
   });

  MinimalIDService.RP.watch(mockedDoc);
}

/*
 * Test that the "identity-controller-request" signal is emitted correctly
 */
function test_request() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-request", function (aSubject, aTopic, aData) {
    do_check_eq(aSubject.wrappedJSObject.id, mockedDoc.id);
    do_check_eq(aSubject.wrappedJSObject.origin, TEST_URL);
    do_test_finished();
    run_next_test();
  });

  MinimalIDService.RP.watch(mockedDoc);
  MinimalIDService.RP.request(mockedDoc.id, {});
}

/*
 * Test that the forceAuthentication flag can be sent
 */
function test_request_forceAuthentication() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-request", function (aSubject, aTopic, aData) {
    do_check_eq(aSubject.wrappedJSObject.id, mockedDoc.id);
    do_check_eq(aSubject.wrappedJSObject.origin, TEST_URL);
    do_check_eq(aSubject.wrappedJSObject.forceAuthentication, true);
    do_test_finished();
    run_next_test();
   });

  MinimalIDService.RP.watch(mockedDoc);
  MinimalIDService.RP.request(mockedDoc.id, {forceAuthentication: true});
}

/*
 * Test that the issuer can be forced
 */
function test_request_forceIssuer() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-request", function (aSubject, aTopic, aData) {
    do_check_eq(aSubject.wrappedJSObject.id, mockedDoc.id);
    do_check_eq(aSubject.wrappedJSObject.origin, TEST_URL);
    do_check_eq(aSubject.wrappedJSObject.issuer, "https://jed.gov");
    do_test_finished();
    run_next_test();
   });

  MinimalIDService.RP.watch(mockedDoc);
  MinimalIDService.RP.request(mockedDoc.id, {issuer: "https://jed.gov"});
}

/*
 * Test that the "identity-controller-logout" signal is emitted correctly
 */
function test_logout() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-logout", function (aSubject, aTopic, aData) {
    do_check_eq(aSubject.wrappedJSObject.id, mockedDoc.id);
    do_test_finished();
    run_next_test();
  });

  MinimalIDService.RP.watch(mockedDoc);
  MinimalIDService.RP.logout(mockedDoc.id, {});
}

/*
 * Test that logout() before watch() fails gently
 */

function test_logoutBeforeWatch() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-logout", function() {
    do_throw("How can we logout when watch was not called?");
  });

  MinimalIDService.RP.logout(mockedDoc.id, {});
  do_test_finished();
  run_next_test();
}

/*
 * Test that request() before watch() fails gently
 */

function test_requestBeforeWatch() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);
  makeObserver("identity-controller-request", function() {
    do_throw("How can we request when watch was not called?");
  });

  MinimalIDService.RP.request(mockedDoc.id, {});
  do_test_finished();
  run_next_test();
}

/*
 * Test that internal unwatch() before watch() fails gently
 */

function test_unwatchBeforeWatch() {
  do_test_pending();

  let mockedDoc = mock_doc(null, TEST_URL);

  MinimalIDService.RP.unwatch(mockedDoc.id, {});
  do_test_finished();
  run_next_test();
}

/*
 * FirefoxAccounts flows
 */

function test_fxa_watch() {
  do_test_pending();
  
  let mockedRP = mock_fxa_rp(null, TEST_URL, function(method) {
    do_check_eq(method, "ready");
    do_test_finished();
    run_next_test();
  });

  MinimalIDService.RP.watch(mockedRP);
}

function test_fxa_request() {
  do_test_pending();

  let mockedRP = mock_fxa_rp(null, TEST_URL, function(method) {
    do_check_eq(method, "ready");
    // After watch() is complete, the fxa service calls our onready
    // callback.  Now we can call request();
    MinimalIDService.RP.request(mockedRP.id);
  });

  // Mock the Firefox Accounts Manager
  function MockFXA() {
    this.watch = function() {
      mockedRP.doReady(mockedRP.id);
    },

    this.request = function() {
      do_test_finished();
      run_next_test();
    }
  }

  // Replace the firefox accounts delegate in the Identity Service.
  // This will obviously have side-effects for any subsequent tests.
  MinimalIDService._delegates["firefox-accounts"] = new MockFXA();

  // First, call watch()
  MinimalIDService.RP.watch(mockedRP);
}

let TESTS = [
  test_overall,
  test_mock_doc,
  test_watch,
  test_request,
  test_request_forceAuthentication,
  test_request_forceIssuer,
  test_logout,
  test_logoutBeforeWatch,
  test_requestBeforeWatch,
  test_unwatchBeforeWatch,

  test_fxa_watch,
  test_fxa_request
];

TESTS.forEach(add_test);

function run_test() {
  run_next_test();
}
