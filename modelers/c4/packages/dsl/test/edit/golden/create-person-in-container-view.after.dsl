workspace "Shop" {
    model {
        customer = person "Customer"
        admin = person "Admin"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
        }
        customer -> web "Uses"
        web -> api "Calls"
    }
    views {
        container shop "ShopContainers" {
            include *
            include admin
            autoLayout tb
            properties {
                "c4modeler.element.admin" "492,-108"
            }
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
    }
}
