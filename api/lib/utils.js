/**
 * Utilitários compartilhados entre as funções serverless da API.
 */

/**
 * Retorna uma string limpa ou um fallback.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function cleanString(value, fallback = "") {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

/**
 * Converte um valor para um inteiro positivo, ou null se inválido.
 * @param {unknown} value
 * @returns {number|null}
 */
export function parsePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}
