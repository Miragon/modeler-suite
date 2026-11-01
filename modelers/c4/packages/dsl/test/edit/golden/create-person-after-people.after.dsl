workspace "Shop" {
    model {
        customer = person "Customer"
        person_r7vl = person "Person"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout lr
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.person_r7vl" "92,292"
                "c4modeler.element.shop" "400,28"
            }
        }
    }
}
