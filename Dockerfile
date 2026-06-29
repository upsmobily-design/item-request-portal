# ==========================================
# PRODUCTION DOCKERFILE FOR RENDER DEPLOYMENT
# ==========================================

# Use a lightweight Debian-based Node image
FROM node:20-bookworm-slim

# Install system dependencies (libaio1 is mandatory for Oracle Thick Client)
RUN apt-get update && apt-get install -y \
    libaio1 \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download and install Oracle Instant Client 19.26 for Linux
WORKDIR /opt/oracle
RUN wget https://download.oracle.com/otn_software/linux/instantclient/1926000/instantclient-basic-linux.x64-19.26.0.0.0dbru.zip \
    && unzip instantclient-basic-linux.x64-19.26.0.0.0dbru.zip \
    && rm -f instantclient-basic-linux.x64-19.26.0.0.0dbru.zip

# Configure environment paths for Oracle Thin/Thick Client
ENV LD_LIBRARY_PATH="/opt/oracle/instantclient_19_26"
ENV ORACLE_LIB_DIR="/opt/oracle/instantclient_19_26"

# Create application directory
WORKDIR /usr/src/app

# Copy backend dependencies and install them
COPY backend/package*.json ./backend/
WORKDIR /usr/src/app/backend
RUN npm ci

# Copy backend source code and root spreadsheets
WORKDIR /usr/src/app
COPY backend/ ./backend/
COPY MOBILY_IM_TAXONOM.xlsb ./
COPY ["expense items 1.0.xlsx", "./"]
COPY ["Bulk_Load_Template_PROPERTY_AND_FACILITIES.xlsx", "./"]

# Build the TypeScript project
WORKDIR /usr/src/app/backend
RUN npm run build

# Expose backend API port
EXPOSE 5000

# Start backend server
CMD [ "npm", "start" ]
