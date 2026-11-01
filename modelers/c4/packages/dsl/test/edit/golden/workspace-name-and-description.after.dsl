workspace "Book Shop" "Sells books." {
    model {
        customer = person "Customer"
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
