package com.pdfkagaz.pdfnative

import expo.modules.kotlin.exception.CodedException

class FileNotFoundException(message: String = "File not found", cause: Throwable? = null) :
  CodedException("ERR_FILE_NOT_FOUND", message, cause)

class PdfEncryptedException(message: String = "PDF is password-protected", cause: Throwable? = null) :
  CodedException("ERR_PDF_ENCRYPTED", message, cause)

class PdfInvalidException(message: String = "PDF is damaged or not a PDF", cause: Throwable? = null) :
  CodedException("ERR_PDF_INVALID", message, cause)

class PermissionDeniedException(message: String = "Permission denied", cause: Throwable? = null) :
  CodedException("ERR_PERMISSION_DENIED", message, cause)

class FileExistsException(message: String = "A file with that name already exists", cause: Throwable? = null) :
  CodedException("ERR_FILE_EXISTS", message, cause)

class InvalidNameException(message: String = "Invalid file name", cause: Throwable? = null) :
  CodedException("ERR_INVALID_NAME", message, cause)

class PasswordUnsupportedException(message: String = "Opening password-protected PDFs is not supported yet", cause: Throwable? = null) :
  CodedException("ERR_PASSWORD_UNSUPPORTED", message, cause)

class NoActivityException(message: String = "No current activity", cause: Throwable? = null) :
  CodedException("ERR_NO_ACTIVITY", message, cause)
