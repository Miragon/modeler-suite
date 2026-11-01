workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        softwareSystem_r7vl = softwareSystem "Software System"
        customer -> shop "Uses"
        shop -> softwareSystem_r7vl
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
                "c4modeler.element.softwareSystem_r7vl" "832,0"
            }
        }
    }
}
