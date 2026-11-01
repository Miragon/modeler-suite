workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            frontend = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
        }
        customer -> frontend "Uses"
        frontend -> api "Calls"
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
