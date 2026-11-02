workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
            container_rnij = container "Database" "" "" "Database"
        }
        customer -> web "Uses"
        web -> api "Calls"
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb
            properties {
                "c4modeler.element.container_rnij" "0,520"
            }
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
        styles {
            element "Database" {
                shape cylinder
            }
        }
    }
}
