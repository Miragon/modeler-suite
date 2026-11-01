workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" "Sells."
        softwareSystem_r7vl = softwareSystem "Software System"
        customer -> shop "Buys from"
        shop -> softwareSystem_r7vl
    }
    views {
        systemContext shop "ShopContext" {
            include *
            autoLayout tb
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,28"
                "c4modeler.element.softwareSystem_r7vl" "832,28"
            }
        }
    }
}
