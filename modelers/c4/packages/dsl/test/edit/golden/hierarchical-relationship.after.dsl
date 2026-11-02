workspace {
    !identifiers hierarchical
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        shop.web -> shop.api "Calls"
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb 300 160
        }
    }
}
