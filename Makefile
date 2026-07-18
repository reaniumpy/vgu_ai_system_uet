# cortis — one-command build & run.
#
#   make run     build the image and run it (opens on http://localhost:8000)
#   make build   build the image only
#   make stop     stop and remove the running container
#   make logs     follow container logs
#
# The AI assistant on the SAFE path uses the OpenAI (ChatGPT) API. Enable it by
# pasting your key into the git-ignored `.env` file (OPENAI_API_KEY=...), then:
#
#   make run
#
# Or pass it inline for a one-off (overrides .env):
#
#   OPENAI_API_KEY=sk-... make run
#
# The guard itself works with no key at all.

IMAGE := cortis
NAME  := cortis
PORT  ?= 8000

# Load .env automatically if present.
ENVFILE := $(wildcard .env)

.PHONY: run build stop logs

build:
	docker build -t $(IMAGE) .

run: build stop
	docker run -d --name $(NAME) -p $(PORT):8000 \
		-v cortis-data:/app/data \
		$(if $(ENVFILE),--env-file .env,) \
		$(if $(OPENAI_API_KEY),-e OPENAI_API_KEY,) \
		$(IMAGE)
	@echo ""
	@echo "cortis is starting on http://localhost:$(PORT)"
	@echo "(first request loads the model; give it a few seconds)"

stop:
	-docker rm -f $(NAME) 2>/dev/null || true

logs:
	docker logs -f $(NAME)
