workspace "Shop" {
    model {
        customer = person "Customer"
        person_r7vl = person "Person"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
        shop -> person_r7vl
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
            }
        }
    }
}
