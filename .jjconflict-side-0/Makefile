bump:
	@CURRENT=$$(grep -m1 '^version = ' src-tauri/Cargo.toml | sed 's/.*"\(.*\)".*/\1/'); \
	NEW="$(VERSION)"; \
	if [ -z "$$NEW" ]; then \
		printf "Current version: $$CURRENT\nNew version: "; \
		read NEW; \
	fi; \
	if [ -z "$$NEW" ]; then echo "No version entered, aborting."; exit 1; fi; \
	echo "Bumping $$CURRENT -> $$NEW"; \
	sed -i '' "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$$NEW\"/" package.json; \
	sed -i '' "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$$NEW\"/" src-tauri/tauri.conf.json; \
	sed -i '' "0,/^version = \"[^\"]*\"/s//version = \"$$NEW\"/" src-tauri/Cargo.toml; \
	(cd src-tauri && cargo update -p treq 2>/dev/null) || true; \
	echo "Done."
2