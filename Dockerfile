# Node.js Version (empfohlen: LTS)
FROM node:21-alpine

# Arbeitsverzeichnis im Container erstellen
WORKDIR /app

# Package files kopieren
COPY package*.json ./

# Dependencies installieren (inklusive nodemon)
RUN npm install

# nodemon global installieren für Live-Reload
RUN npm install -g nodemon

# Alle Dateien kopieren
COPY . .

# Für Google Cloud
ENV GOOGLE_APPLICATION_CREDENTIALS="./env.vertexkey.json"


# Port freigeben
EXPOSE 3000

# Standard Command (wird von docker-compose überschrieben)
CMD ["npm", "start"]