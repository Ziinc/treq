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