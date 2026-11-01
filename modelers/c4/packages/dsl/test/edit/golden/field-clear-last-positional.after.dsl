workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages."
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
            autoLayout tb
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
    }
}
