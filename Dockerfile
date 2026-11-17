# syntax=docker/dockerfile:1

# ── Construction ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Le lock est écrit par npm 11 : le npm 10 livré avec Node 22 le juge désynchronisé.
RUN npm install -g npm@11

# Dépendances seules d'abord : cette couche reste en cache tant que le lock ne
# change pas. --ignore-scripts : le postinstall (nuxt prepare) a besoin des
# sources, qui ne sont pas encore copiées ; `nuxt build` s'en charge plus bas.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── Exécution ────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Réglages lus au démarrage du conteneur ; ce sont ici leurs valeurs par défaut.
# HOST n'est pas fixé : le serveur écoute sur toutes les interfaces du conteneur.
ENV NODE_ENV=production \
    HOST_SERV=192.168.1.19 \
    PORT_SERV=3007 \
    PORT_WS=8099 \
    PORT_WS_BROADCAST=9086 \
    PORT=3001

# .output est autonome : ni node_modules ni sources dans l'image finale.
COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3001

# Les URL WebSocket données au navigateur dérivent de HOST_SERV, PORT_WS et
# PORT_WS_BROADCAST : Nuxt ne relit sa configuration publique au démarrage que
# sous la forme NUXT_PUBLIC_*.
CMD ["sh", "-c", "NUXT_PUBLIC_WS_BASE=ws://$HOST_SERV:$PORT_WS NUXT_PUBLIC_WS_URL_BROADCAST=ws://$HOST_SERV:$PORT_WS_BROADCAST exec node .output/server/index.mjs"]
