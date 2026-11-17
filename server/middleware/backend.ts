/**
 * Relais vers le back-end HomeCine :
 *
 *   /proxy/**  →  http://HOST_SERV:PORT_SERV/**
 *   /refresh   →  http://HOST_SERV:PORT_SERV/refresh
 *                 (à la racine : le cookie REFRESH_TOKEN a path:/refresh côté serveur)
 *
 * L'adresse est lue À L'EXÉCUTION dans l'environnement (HOST_SERV, PORT_SERV),
 * avec repli sur la valeur connue à la construction : une image Docker déjà
 * construite peut viser un autre back-end sans être reconstruite.
 */
export default defineEventHandler((event) => {
  const isProxy = event.path.startsWith('/proxy/')
  if (!isProxy && !/^\/refresh(\?|$)/.test(event.path)) return

  const { hostServ, portServ } = useRuntimeConfig(event)
  const backend = `http://${process.env.HOST_SERV || hostServ}:${process.env.PORT_SERV || portServ}`
  return proxyRequest(event, backend + (isProxy ? event.path.slice('/proxy'.length) : event.path))
})
