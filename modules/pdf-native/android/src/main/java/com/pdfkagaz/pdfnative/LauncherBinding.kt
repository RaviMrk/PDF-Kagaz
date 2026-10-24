package com.pdfkagaz.pdfnative

import java.lang.ref.WeakReference

/**
 * The activity the activity-result launchers were last registered against. Expo's registry drops
 * a launcher when that activity is destroyed, and AppContext re-registers only when its
 * onHostDestroy ran first, which Expo's ReactActivityDelegateWrapper posts after the new
 * activity's onResume on a config-change recreation. So the module re-registers itself whenever
 * the current activity differs. Weak, so it never keeps a destroyed activity alive. Main thread only.
 */
internal class LauncherBinding {
  private var bound = WeakReference<Any>(null)

  fun bind(activity: Any) {
    bound = WeakReference(activity)
  }

  /** True when the launchers must be registered again before launching from [current]. */
  fun needsRegistration(current: Any): Boolean = bound.get() !== current
}
