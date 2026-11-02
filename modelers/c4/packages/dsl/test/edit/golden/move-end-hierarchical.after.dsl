workspace {
    !identifiers hierarchical
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API" {
                orders = component "Orders"
            }
        }
        crm = softwareSystem "CRM"
        shop.api.orders -> crm "Reads customers from"
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb 300 160
        }
    }
}
