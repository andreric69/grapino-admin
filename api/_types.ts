/**
 * Minimale eigene Typen fuer Vercel-Funktionen statt der @vercel/node-
 * Abhaengigkeit - die brachte nur Typdefinitionen (wird zur Laufzeit nicht
 * ausgefuehrt, Vercel selbst stellt die echte Umgebung bereit), zog aber eine
 * lange Kette veralteter, teils kritischer Sicherheitsluecken in Dev-
 * Tooling-Unterabhaengigkeiten (ajv, undici, path-to-regexp) mit sich.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: unknown;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
}
