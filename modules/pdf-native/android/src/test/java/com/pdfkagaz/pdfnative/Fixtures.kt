package com.pdfkagaz.pdfnative

import java.io.File

/** The repo's `__fixtures__/` folder, on the unit-test classpath (see build.gradle sourceSets). */
object Fixtures {
  /** A fixture file, read in place; tests write only into their own temp folders. */
  fun file(name: String): File = fileOrNull(name) ?: error("Missing fixture: $name")

  /** Null when absent (the generated `large/` fixtures are gitignored). */
  fun fileOrNull(name: String): File? =
    Fixtures::class.java.classLoader?.getResource(name)?.toURI()?.let(::File)?.takeIf { it.isFile }
}
