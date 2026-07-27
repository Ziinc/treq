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
	@find ./supabase/functions/* -type d ! -name '_*'  | xargs -I {} basename {} | xargs -I {} supabase functions deploy {}

.PHONY: bump start db.ßdiff deploy restart db.reset stop