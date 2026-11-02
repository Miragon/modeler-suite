workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout lr
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "480,28"
            }
        }
    }
}
