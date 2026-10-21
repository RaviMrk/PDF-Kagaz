package com.pdfkagaz.pdfnative

import androidx.core.content.FileProvider

/**
 * Grants other apps read access to PDFs this app shares, prints or opens with. Its own subclass
 * and authority (`<applicationId>.pdfnative.files`) so it never collides with other libraries'
 * FileProviders (react-native-blob-util declares one).
 */
class PdfNativeFileProvider : FileProvider()
