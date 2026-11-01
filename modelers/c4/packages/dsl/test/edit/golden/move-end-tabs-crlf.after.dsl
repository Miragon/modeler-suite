workspace "Tabs" {
	model {
		shop = softwareSystem "Shop" {
			web = container "Web"
		}
		crm = softwareSystem "CRM"
		// Nightly.
		web	->	crm "Syncs customers" {
			perspectives {
				"Security" "Uses mTLS."
			}
		}
	}
	views {
		systemLandscape "Landscape" {
			include *
			autoLayout tb 300 160
		}
	}
}
