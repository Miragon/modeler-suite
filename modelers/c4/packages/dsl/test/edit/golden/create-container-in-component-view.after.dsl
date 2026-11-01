workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
            queue = container "Queue"
        }
        customer -> web "Uses"
        web -> api "Calls"
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb
        }
        component api "ApiComponents" {
            include *
            include queue
            autoLayout tb
            properties {
                "c4modeler.element.queue" "480,-80"
            }
        }
    }
}
