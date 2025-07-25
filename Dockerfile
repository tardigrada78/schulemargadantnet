# Node.js Version (empfohlen: LTS)
FROM node:18-alpine

# Arbeitsverzeichnis im Container erstellen
WORKDIR /app

# Package.json und package-lock.json kopieren (falls vorhanden)
COPY package*.json ./

# Dependencies installieren
RUN npm install

# Projektdateien kopieren
COPY . .

# Port freigeben (standardmäßig 3000, anpassen falls nötig)
EXPOSE 3000

# Startbefehl definieren
CMD ["npm", "start"]