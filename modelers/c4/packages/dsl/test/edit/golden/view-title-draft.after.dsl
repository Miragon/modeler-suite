workspace "Shop" {
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
        container shop "Containers-shop" {
            include *
            autoLayout tb 300 160
            title "Inside the shop"
        }
    }
}
