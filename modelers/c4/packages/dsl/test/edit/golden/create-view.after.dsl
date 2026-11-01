workspace "Shop" {
    model {
        customer = person "Customer"
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
            autoLayout tb
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
        systemContext shop "SystemContext-shop" {
            include *
            autoLayout tb 300 160
            title "Who uses the shop"
        }
    }
}
