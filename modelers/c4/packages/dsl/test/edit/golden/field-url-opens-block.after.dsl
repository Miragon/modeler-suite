workspace "Shop" {
    model {
        customer = person "Customer" {
            url "https://example.com/customers"
        }
        shop = softwareSystem "Shop" "Sells."
        customer -> shop "Buys from"
    }
    views {
        systemContext shop "ShopContext" {
            include *
            autoLayout tb
        }
    }
}
