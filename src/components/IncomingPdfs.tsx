import { useIncomingPdfs } from '@/services/intent/useIncomingPdfs';

/** Routes PDFs shared to the app to /open; renders nothing. */
export function IncomingPdfs() {
  useIncomingPdfs();
  return null;
}
