workspace {
    model {
        payments = softwareSystem "Payments"
        shop = softwareSystem "Shop" {
            description "Sells."
            web = container "Web"
            group "Data" {
                db = container "DB"
            }
            api = container "API"
            -> payments "Pays with"
        }
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.api" "-120,-80"
            }
        }
    }
}
