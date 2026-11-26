FROM denoland/deno:2.1.4 AS development

WORKDIR /app

# `publishChannelAudio` measures each episode with ffmpeg. Without it episodes
# still publish, but carry an empty waveform.
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
USER deno

COPY deno.json deno.lock ./

COPY . .

RUN deno cache mod.ts

EXPOSE 1405

CMD ["deno", "task", "dev"]

FROM denoland/deno:2.1.4 AS production

WORKDIR /app

# Runtime dependency: the publish act decodes the hosted bytes to build the
# scrubber waveform. A missing binary degrades to an empty waveform, never a
# failed publish.
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
USER deno

COPY deno.json deno.lock ./

COPY mod.ts ./
COPY src/ ./src/
COPY models/ ./models/
COPY utils/ ./utils/

RUN deno cache mod.ts

EXPOSE 1405

CMD ["deno", "run", "--allow-all", "mod.ts"]
