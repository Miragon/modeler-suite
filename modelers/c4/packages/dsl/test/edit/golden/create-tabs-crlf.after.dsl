workspace "Tabs" {
	model {
		customer = person "Customer"
		shop = softwareSystem "Shop" {
			web = container "Web"
			api = container "API"
		}
	}
	views {
		container shop "ShopContainers" {
			include *
			properties {
				"c4modeler.element.api" "0,0"
				"c4modeler.element.web" "0,0"
			}
		}
	}
}
