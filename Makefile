bump:
	@CURRENT=$$(grep -m1 '^version = ' src-tauri/Cargo.toml | sed 's/.*"\(.*\)".*/\1/'); \
	NEW="$(VERSION)"; \
	if [ -z "$$NEW" ]; then \
		printf "Current version: $$CURRENT\nNew version: "; \
		read NEW; \
	fi; \
	if [ -z "$$NEW" ]; then echo "No version entered, aborting."; exit 1; fi; \
	echo "Bumping $$CURRENT -> $$NEW"; \
	perl -0pi -e 's/"version": "[^"]*"/"version": "'"$$NEW"'"/' package.json; \
	perl -0pi -e 's/"version": "[^"]*"/"version": "'"$$NEW"'"/' src-tauri/tauri.conf.json; \
	perl -0pi -e 's/^version = "[^"]*"/version = "'"$$NEW"'"/m' src-tauri/Cargo.toml; \
	(cd src-tauri && cargo update -p treq 2>/dev/null) || true; \
	echo "Done."

stop:
	supabase stop

restart:
	$(MAKE) stop
	$(MAKE) start

db.reset:
	supabase db reset --local

db.diff:
	@NAME="$(NAME)"; \
	if [ -z "$$NAME" ]; then \
		printf "Migration name: "; \
		read NAME; \
	fi; \
	if [ -z "$$NAME" ]; then echo "No migration name entered, aborting."; exit 1; fi; \
	supabase db diff --local --file "$$NAME"


deploy:
	@echo 'Deploying DB migrations now'
	@supabase db push
	@echo 'Deploying functions now'
	@for entrypoint in supabase/functions/*/index.ts; do \
		function_dir=$${entrypoint%/index.ts}; \
		supabase functions deploy "$${function_dir##*/}" || exit $$?; \
	done

selfhost.test:
	sh self-host/tests/run.sh

selfhost.pack:
	sh self-host/pack.sh --skip-refresh

.PHONY: bump start db.diff deploy restart db.reset stop selfhost.test selfhost.pack