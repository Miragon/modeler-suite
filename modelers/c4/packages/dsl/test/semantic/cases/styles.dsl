workspace {
    model {
        a = softwareSystem "A" "" "Database"
    }
    views {
        styles {
            element "Element" {
                background #FFAABB
                color white
                stroke ForestGreen
                shape roundedbox
                strokeWidth 20
                opacity 150
                border dotted
                width 500
                height 250
                fontSize 30
                metadata false
                description true
            }
            element "Database" {
                shape cylinder
            }
            element "Element" {
                background #000000
            }
            relationship "Relationship" {
                thickness 4
                colour #707070
                dashed false
                routing orthogonal
                position 150
                opacity 50
                width 300
                fontSize 18
            }
            light {
                element "Database" {
                    background lightblue
                }
            }
            dark {
                element "Database" {
                    background darkblue
                }
            }
        }
        terminology {
            person "Persona"
            softwareSystem "Product"
            metadata round
        }
    }
}
