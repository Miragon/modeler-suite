workspace {
    model {
        shop = softwareSystem "Shop" {
            description "Sells."
            tags "Internal"
            properties {
                "owner" "team"
            }
            web = container "Web"
        }
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.web" "-120,-80"
            }
        }
    }
}
