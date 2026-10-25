package com.pdfkagaz.pdfnative

import expo.modules.kotlin.exception.CodedException

class FileNotFoundCodedException(message: String = "File not found", cause: Throwable? = null) :
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

/** Disk full, provider failure or any other I/O error; never carries a file name or path. */
class IoCodedException(message: String = "File operation failed", cause: Throwable? = null) :
  CodedException("ERR_IO", message, cause)

/** The file is on a storage volume (e.g. a removed SD card) that is not mounted right now. */
class VolumeUnavailableException(message: String = "Storage volume is not available", cause: Throwable? = null) :
  CodedException("ERR_VOLUME_UNAVAILABLE", message, cause)

/** The input is over the size cap of the tool it was given to. */
class TooLargeException(message: String = "File is too large for this tool", cause: Throwable? = null) :
  CodedException("ERR_TOO_LARGE", message, cause)

/** An image that cannot be decoded, or whose bounds are zero or negative. */
class ImageInvalidException(message: String = "Image is damaged or in an unsupported format", cause: Throwable? = null) :
  CodedException("ERR_IMAGE_INVALID", message, cause)

/** Play services missing or outdated, the ML Kit scanner unsupported or not downloaded, or its launch failed. */
class ScannerUnavailableException(message: String = "Document scanner is not available", cause: Throwable? = null) :
  CodedException("ERR_SCANNER_UNAVAILABLE", message, cause)

/** The password typed for an encrypted PDF does not open it. */
class PasswordWrongException(message: String = "Wrong password", cause: Throwable? = null) :
  CodedException("ERR_PASSWORD_WRONG", message, cause)

/** The PDF opens, but its permissions forbid the change; the owner password is needed. */
class PasswordRestrictedException(message: String = "PDF is restricted; the owner password is needed", cause: Throwable? = null) :
  CodedException("ERR_PASSWORD_RESTRICTED", message, cause)

/** The job was cancelled (cancelNativeTool) before it finished. */
class CancelledException(message: String = "Cancelled", cause: Throwable? = null) :
  CodedException("ERR_CANCELLED", message, cause)

/** The phone ran out of memory (an OutOfMemoryError) on this input; not a size-cap refusal. */
class OutOfMemoryCodedException(message: String = "Not enough memory for this file", cause: Throwable? = null) :
  CodedException("ERR_OUT_OF_MEMORY", message, cause)
