workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0,320,200"
                "c4modeler.relationship.customer->shop" "200,300 301,300"
            }
        }
    }
}
