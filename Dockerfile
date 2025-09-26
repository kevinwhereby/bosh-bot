FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /opt

# Install node-gyp dependencies and git
RUN apt-get update && apt-get install -y libpq-dev g++ make python3 git \
    ffmpeg libasound2 libasound2-plugins alsa-utils alsa-oss

# Setup users
RUN groupadd captureagentgroup \
    && useradd -ms /bin/bash captureagent \
    && usermod -aG captureagentgroup captureagent

COPY ./package.json /opt
COPY ./yarn.lock /opt

# Copy package.jsons for all workspace packages
COPY package.json /opt/

RUN yarn install --production --ignore-optional

COPY dist /opt/dist
COPY bosh.wav /opt

RUN chown -R captureagent:captureagentgroup .

VOLUME /dev/shm:/dev/shm

USER captureagent

ENTRYPOINT ["node", "/opt/dist/index.js"]
