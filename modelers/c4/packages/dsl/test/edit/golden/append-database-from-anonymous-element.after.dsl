workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            api = container "API"
            container_9po1 = container "Database" "" "" "Database"
        }
        api -> container_9po1
    }
    views {
        container shop "ShopContainers" {
            include *
            properties {
                "c4modeler.element.api" "0,0"
                "c4modeler.element.container_9po1" "432,0"
            }
        }
        styles {
            element "Database" {
                shape cylinder
            }
        }
    }
}
