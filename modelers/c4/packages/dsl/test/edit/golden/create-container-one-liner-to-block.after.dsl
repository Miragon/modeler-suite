workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" "Sells." {
            container_rbrl = container "Container"
        }
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
            properties {
                "c4modeler.element.container_rbrl" "280,220"
            }
        }
    }
}
