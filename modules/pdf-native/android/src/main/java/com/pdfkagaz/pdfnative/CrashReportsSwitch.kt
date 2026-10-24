package com.pdfkagaz.pdfnative

/**
 * Turns Crashlytics collection off in the running process. @react-native-firebase only stores the
 * opt-out for the next start, so without this an uncaught native crash later in the same session
 * would still be uploaded. Firebase is optional (linked only with google-services.json), so it is
 * reached by reflection; the release build keeps the two members (app.json extraProguardRules).
 */
internal object CrashReportsSwitch {
  const val FIREBASE_CRASHLYTICS = "com.google.firebase.crashlytics.FirebaseCrashlytics"

  /** True when collection was switched off; false when Crashlytics is absent or the call failed. */
  fun disableNow(className: String = FIREBASE_CRASHLYTICS): Boolean =
    try {
      val type = Class.forName(className)
      val instance = type.getMethod("getInstance").invoke(null)
      type
        .getMethod("setCrashlyticsCollectionEnabled", java.lang.Boolean::class.java)
        .invoke(instance, java.lang.Boolean.FALSE)
      true
    } catch (_: ReflectiveOperationException) {
      false
    } catch (_: LinkageError) {
      false
    } catch (_: RuntimeException) {
      false
    }
}
