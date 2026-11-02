workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
        }
        payments = softwareSystem "Payments"
        customer -> web "Uses"
        web -> api "Calls"
    }
    views {
        container shop "ShopContainers" {
            include *
            include payments
            autoLayout tb
            properties {
                "c4modeler.element.payments" "480,-80"
            }
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
    }
}
