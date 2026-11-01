workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" "Sells."
        customer -> shop "Buys from" "" "Async" {
            url "https://example.com/orders"
        }
    }
    views {
        systemContext shop "ShopContext" {
            include *
            autoLayout tb
        }
    }
}
