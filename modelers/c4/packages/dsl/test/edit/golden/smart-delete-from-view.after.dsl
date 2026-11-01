workspace {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            exclude customer
            autoLayout tb 300 160
            properties {
                "c4modeler.element.shop" "400,28"
            }
        }
        systemContext shop "ShopContext" {
            include *
            autoLayout tb 300 160
        }
    }
}
