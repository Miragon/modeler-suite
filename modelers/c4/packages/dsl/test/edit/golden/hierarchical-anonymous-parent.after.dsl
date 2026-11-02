workspace {
    !identifiers hierarchical
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
    }

    views {
        systemLandscape "SystemLandscape" {
            include *
            autoLayout tb 300 160
        }
        systemContext shop "SystemContext-shop" {
            include *
            autoLayout tb 300 160
        }
        container shop "Containers-shop" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.shop.api" "-120,-80"
            }
        }
    }
}
