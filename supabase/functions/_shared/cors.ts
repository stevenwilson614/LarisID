export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

export function corsOk(): Response {
  return new Response('ok', { headers: CORS })
}
